import type { AccountProfile } from '@acres/shared';
import type { Account } from '../generated/prisma/client';

/** Pure mapping, so every module can produce a profile without a cycle. */
export function toAccountProfile(account: Account): AccountProfile {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt.toISOString(),
  };
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
