import { Injectable } from '@nestjs/common';
import { compare, hash, hashSync } from 'bcryptjs';
import type { AccountProfile } from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { Account } from '../generated/prisma/client';
import { ApiException } from '../common/api-exception';
import { normaliseEmail, toAccountProfile } from './account-profile';

/**
 * bcrypt cost. 12 is the current OWASP-aligned floor for bcrypt: slow enough
 * to matter to an offline attacker, fast enough for an interactive login.
 */
export const BCRYPT_COST = 12;

/**
 * A digest of a value no account uses, computed once at load rather than
 * pasted in, so it is always a valid bcrypt hash at the configured cost.
 * Comparing against it when no account matches keeps the failure path's timing
 * close to the success path's, so response time does not leak whether an email
 * is registered.
 */
const DUMMY_HASH = hashSync('acres-no-such-account', BCRYPT_COST);

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { email: normaliseEmail(email) },
    });
  }

  async findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({ where: { id } });
  }

  /**
   * A caller's "does this email exist?" check cannot be trusted: two concurrent
   * registrations both pass it, and the loser hits `Account.email @unique`.
   * That violation is caught here and converted, so the race answers with the
   * same generic failure as every other existence question rather than a 500
   * that says an account is there.
   */
  async create(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<Account> {
    try {
      return await this.prisma.account.create({
        data: {
          email: normaliseEmail(input.email),
          passwordHash: await hash(input.password, BCRYPT_COST),
          displayName: input.displayName?.trim() || null,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw ApiException.invalidCredentials();
      }
      throw error;
    }
  }

  /** Takes comparable time whether or not `account` is null. */
  async verifyPassword(
    account: Account | null,
    password: string,
  ): Promise<boolean> {
    const digest = account?.passwordHash ?? DUMMY_HASH;
    const matches = await compare(password, digest);
    return account !== null && matches;
  }

  toProfile(account: Account): AccountProfile {
    return toAccountProfile(account);
  }
}

/** P2002 is Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
