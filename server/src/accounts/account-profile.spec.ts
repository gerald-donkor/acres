import type { Account } from '../generated/prisma/client';
import { normaliseEmail, toAccountProfile } from './account-profile';

describe('account profile helpers', () => {
  describe('normaliseEmail', () => {
    it('trims surrounding whitespace and lowercases the address', () => {
      expect(normaliseEmail('  User.Name+Tag@Example.COM\n')).toBe(
        'user.name+tag@example.com',
      );
    });

    it('preserves an empty result and already-normalized addresses', () => {
      expect(normaliseEmail(' \t ')).toBe('');
      expect(normaliseEmail('person@example.com')).toBe('person@example.com');
    });
  });

  describe('toAccountProfile', () => {
    function account(displayName: string | null): Account {
      return {
        id: 'account-1',
        email: 'person@example.com',
        passwordHash: 'not-public',
        displayName,
        createdAt: new Date('2026-09-22T08:15:30.000Z'),
        updatedAt: new Date('2026-09-22T09:00:00.000Z'),
      };
    }

    it('maps the public fields and serializes createdAt', () => {
      expect(toAccountProfile(account('Acre Analyst'))).toEqual({
        id: 'account-1',
        email: 'person@example.com',
        displayName: 'Acre Analyst',
        createdAt: '2026-09-22T08:15:30.000Z',
      });
    });

    it('preserves a null display name', () => {
      expect(toAccountProfile(account(null)).displayName).toBeNull();
    });
  });
});
