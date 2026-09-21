import { Test, type TestingModule } from '@nestjs/testing';
import type { AccountProfile } from '@acres/shared';
import { AccountsController } from './accounts.controller';
import { SessionGuard } from '../sessions/session.guard';

/** Synthetic fixture interface demonstrating non-destructive passthrough of arbitrary caller payload properties */
interface AccountWithRoles extends AccountProfile {
  role?: string;
  roles?: string[];
  status?: string;
  isActive?: boolean;
}

describe('AccountsController', () => {
  let controller: AccountsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AccountsController>(AccountsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(AccountsController);
  });

  it('can be instantiated directly with constructor injection without dependencies', () => {
    const directInstance = new AccountsController();
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(AccountsController);
  });

  describe('profile', () => {
    it('returns the exact AccountProfile object unchanged (referential identity)', () => {
      const account: AccountProfile = {
        id: 'acc_01j9x0a0b1c2d3e4f5g6h7j8k9',
        email: 'ada.lovelace@example.com',
        displayName: 'Ada Lovelace',
        createdAt: '2026-01-15T08:30:00.000Z',
      };

      const result = controller.profile(account);

      // Verifies referential identity (not a clone or altered instance)
      expect(result).toBe(account);
      expect(result).toEqual({
        id: 'acc_01j9x0a0b1c2d3e4f5g6h7j8k9',
        email: 'ada.lovelace@example.com',
        displayName: 'Ada Lovelace',
        createdAt: '2026-01-15T08:30:00.000Z',
      });
    });

    it('does not mutate or modify properties of the input AccountProfile', () => {
      const frozenAccount: AccountProfile = Object.freeze({
        id: 'acc_frozen_001',
        email: 'frozen.user@example.org',
        displayName: 'Immutable User',
        createdAt: '2026-02-20T12:00:00.000Z',
      });

      expect(() => controller.profile(frozenAccount)).not.toThrow();
      const result = controller.profile(frozenAccount);
      expect(result).toBe(frozenAccount);
    });

    describe('diverse account fixture data', () => {
      it('returns an active account with standard profile fields', () => {
        const activeAccount: AccountProfile = {
          id: 'acc_active_standard_1',
          email: 'jane.smith@acres.example.com',
          displayName: 'Jane Smith',
          createdAt: '2026-03-01T09:15:30.000Z',
        };

        const result = controller.profile(activeAccount);

        expect(result).toBe(activeAccount);
        expect(result.id).toBe('acc_active_standard_1');
        expect(result.email).toBe('jane.smith@acres.example.com');
        expect(result.displayName).toBe('Jane Smith');
        expect(result.createdAt).toBe('2026-03-01T09:15:30.000Z');
      });

      it('returns an account with null displayName (minimal account profile)', () => {
        const minimalAccount: AccountProfile = {
          id: 'acc_minimal_null_display',
          email: 'unnamed@example.com',
          displayName: null,
          createdAt: '2026-04-10T14:22:10.000Z',
        };

        const result = controller.profile(minimalAccount);

        expect(result).toBe(minimalAccount);
        expect(result.displayName).toBeNull();
        expect(result.email).toBe('unnamed@example.com');
      });

      it('returns an account with roles and role-based access attributes (e.g. admin, analyst)', () => {
        const adminAccount: AccountWithRoles = {
          id: 'acc_admin_007',
          email: 'admin@acres.org',
          displayName: 'Acres Administrator',
          createdAt: '2025-11-05T00:00:00.000Z',
          role: 'admin',
          roles: ['admin', 'billing_manager'],
          status: 'active',
          isActive: true,
        };

        const analystAccount: AccountWithRoles = {
          id: 'acc_analyst_042',
          email: 'analyst@regional.gov',
          displayName: 'Lead Regional Analyst',
          createdAt: '2026-02-14T10:30:00.000Z',
          role: 'analyst',
          roles: ['analyst', 'viewer'],
          status: 'active',
          isActive: true,
        };

        const viewerAccount: AccountWithRoles = {
          id: 'acc_viewer_100',
          email: 'viewer@partner.edu',
          displayName: 'Guest Viewer',
          createdAt: '2026-07-01T18:00:00.000Z',
          role: 'viewer',
          roles: ['viewer'],
          status: 'active',
          isActive: true,
        };

        expect(controller.profile(adminAccount)).toBe(adminAccount);
        expect(controller.profile(analystAccount)).toBe(analystAccount);
        expect(controller.profile(viewerAccount)).toBe(viewerAccount);
      });

      it('returns accounts with diverse ISO 8601 date timestamps (epoch, leap day, millisecond precision)', () => {
        const epochAccount: AccountProfile = {
          id: 'acc_epoch_historical',
          email: 'historical@example.org',
          displayName: 'Historical Account',
          createdAt: '1970-01-01T00:00:00.000Z',
        };

        const leapDayAccount: AccountProfile = {
          id: 'acc_leap_day_2024',
          email: 'leap.day@example.com',
          displayName: 'Leap Year User',
          createdAt: '2024-02-29T23:59:59.999Z',
        };

        const recentIsoAccount: AccountProfile = {
          id: 'acc_recent_iso_timestamp',
          email: 'recent@example.com',
          displayName: 'Recent Signup',
          createdAt: '2026-09-21T01:31:47.000Z',
        };

        const secondPrecisionAccount: AccountProfile = {
          id: 'acc_seconds_precision',
          email: 'seconds@example.com',
          displayName: 'Seconds Precision User',
          createdAt: '2026-08-15T12:00:00Z',
        };

        expect(controller.profile(epochAccount)).toBe(epochAccount);
        expect(controller.profile(leapDayAccount)).toBe(leapDayAccount);
        expect(controller.profile(recentIsoAccount)).toBe(recentIsoAccount);
        expect(controller.profile(secondPrecisionAccount)).toBe(
          secondPrecisionAccount,
        );
      });

      it('handles accounts with Unicode, accents, and emojis in displayName', () => {
        const unicodeAccount: AccountProfile = {
          id: 'acc_unicode_i18n',
          email: 'renee+test@subdomain.example.co.uk',
          displayName: 'Renée d’Aubigné 🌱',
          createdAt: '2026-05-18T07:45:00.000Z',
        };

        const result = controller.profile(unicodeAccount);

        expect(result).toBe(unicodeAccount);
        expect(result.displayName).toBe('Renée d’Aubigné 🌱');
        expect(result.email).toBe('renee+test@subdomain.example.co.uk');
      });

      test.each<[string, AccountProfile]>([
        [
          'Standard active account',
          {
            id: 'acc_each_1',
            email: 'user1@example.com',
            displayName: 'Active User One',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        [
          'Account with null display name',
          {
            id: 'acc_each_2',
            email: 'user2@example.com',
            displayName: null,
            createdAt: '2026-06-15T10:30:00.000Z',
          },
        ],
        [
          'Account with custom domain and timestamp',
          {
            id: 'acc_each_3',
            email: 'user3@agency.gov',
            displayName: 'Regional Planner',
            createdAt: '2026-09-20T23:59:59.000Z',
          },
        ],
      ])(
        'parameterized profile test: %s returns identical object',
        (_name, account) => {
          const result = controller.profile(account);
          expect(result).toBe(account);
          expect(result.id).toBe(account.id);
          expect(result.email).toBe(account.email);
          expect(result.displayName).toBe(account.displayName);
          expect(result.createdAt).toBe(account.createdAt);
        },
      );
    });

    it('preserves distinct identity across sequential calls with different accounts', () => {
      const accountA: AccountProfile = {
        id: 'acc_sequential_a',
        email: 'alice@example.com',
        displayName: 'Alice',
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const accountB: AccountProfile = {
        id: 'acc_sequential_b',
        email: 'bob@example.com',
        displayName: 'Bob',
        createdAt: '2026-02-01T00:00:00.000Z',
      };

      const resultA = controller.profile(accountA);
      const resultB = controller.profile(accountB);

      expect(resultA).toBe(accountA);
      expect(resultB).toBe(accountB);
      expect(resultA).not.toBe(resultB);
      expect(resultA.id).not.toBe(resultB.id);
    });
  });
});
