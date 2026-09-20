import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ORGANIZATION_HEADER_NAME } from '@acres/shared';
import type { AcresConfigService } from '../config/acres-config.service';
import type { TenantTransactionService } from '../prisma/tenant-transaction.service';
import type { AuthenticatedRequest } from '../sessions/authenticated-request';
import { getOrganizationFromContext } from './current-organization.decorator';
import { OrganizationContextGuard } from './organization-context.guard';
import type {
  OrganizationContext,
  RequestWithOrganization,
} from './organization-context';

type RequestFixture = Partial<
  AuthenticatedRequest & RequestWithOrganization
> & {
  headers?: Record<string, string>;
};

function createMockExecutionContext(request: RequestFixture = {}): {
  context: ExecutionContext;
  req: AuthenticatedRequest & RequestWithOrganization;
} {
  const headers = request.headers ?? {};
  const req = {
    params: {},
    sessionContext: {
      sessionId: 'sess-1',
      account: {
        id: 'acc-1',
        email: 'test@example.com',
        displayName: 'Test',
        createdAt: '2026-08-20T00:00:00.000Z',
      },
      expiresAt: new Date(),
    },
    header: (name: string) => headers[name.toLowerCase()],
    ...request,
  } as unknown as AuthenticatedRequest & RequestWithOrganization;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getType: () => 'http',
    getClass: () => class {},
    getHandler: () => () => {},
    getArgs: () => [req],
    getArgByIndex: () => req,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('OrganizationContextGuard and @CurrentOrganization()', () => {
  const validOrgId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const alternativeOrgId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

  let mockTenants: {
    accountScoped: jest.Mock;
  };
  let mockConfig: {
    tenancyEnabled: boolean;
  };

  beforeEach(() => {
    mockTenants = {
      accountScoped: jest.fn(),
    };
    mockConfig = {
      tenancyEnabled: true,
    };
  });

  describe('OrganizationContextGuard', () => {
    let guard: OrganizationContextGuard;

    beforeEach(() => {
      guard = new OrganizationContextGuard(
        mockTenants as unknown as TenantTransactionService,
        mockConfig as unknown as AcresConfigService,
      );
    });

    it('throws notReady when tenancyEnabled is false', async () => {
      mockConfig.tenancyEnabled = false;
      const { context } = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_READY',
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(mockTenants.accountScoped).not.toHaveBeenCalled();
    });

    it('throws notFound when organizationId is absent from both params and headers', async () => {
      const { context } = createMockExecutionContext({
        params: {},
        headers: {},
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockTenants.accountScoped).not.toHaveBeenCalled();
    });

    it('throws notFound when organizationId has invalid UUID format in param', async () => {
      const { context } = createMockExecutionContext({
        params: { organizationId: 'not-a-valid-uuid' },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockTenants.accountScoped).not.toHaveBeenCalled();
    });

    it('throws notFound when organizationId has invalid UUID format in header', async () => {
      const { context } = createMockExecutionContext({
        headers: { [ORGANIZATION_HEADER_NAME]: '123-bad-uuid' },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockTenants.accountScoped).not.toHaveBeenCalled();
    });

    it('throws notFound when param and header provide conflicting organization IDs', async () => {
      const { context } = createMockExecutionContext({
        params: { organizationId: validOrgId },
        headers: { [ORGANIZATION_HEADER_NAME]: alternativeOrgId },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(mockTenants.accountScoped).not.toHaveBeenCalled();
    });

    it('ignores array param value and falls back to header if available', async () => {
      const mockMembership = {
        id: 'mem-1',
        organizationId: validOrgId,
        accountId: 'acc-1',
        role: 'analyst' as const,
      };
      mockTenants.accountScoped.mockImplementation(
        (
          accountId: string,
          callback: (tx: {
            membership: { findFirst: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          expect(accountId).toBe('acc-1');
          return callback({
            membership: {
              findFirst: jest.fn().mockResolvedValue(mockMembership),
            },
          });
        },
      );

      const { context, req } = createMockExecutionContext({
        params: {
          organizationId: ['array-val-1', 'array-val-2'] as unknown as string,
        },
        headers: { [ORGANIZATION_HEADER_NAME]: validOrgId },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req.organizationContext).toEqual({
        organizationId: validOrgId,
        accountId: 'acc-1',
        membershipId: 'mem-1',
        role: 'analyst',
      });
    });

    it('resolves organizationId from route param and attaches organizationContext', async () => {
      const mockMembership = {
        id: 'mem-1',
        organizationId: validOrgId,
        accountId: 'acc-1',
        role: 'owner' as const,
      };
      const findFirstMock = jest.fn().mockResolvedValue(mockMembership);
      mockTenants.accountScoped.mockImplementation(
        (
          _accountId: string,
          callback: (tx: {
            membership: { findFirst: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          return callback({
            membership: {
              findFirst: findFirstMock,
            },
          });
        },
      );

      const { context, req } = createMockExecutionContext({
        params: { organizationId: validOrgId },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(findFirstMock).toHaveBeenCalledWith({
        where: {
          organizationId: validOrgId,
          accountId: 'acc-1',
          revokedAt: null,
        },
      });
      expect(req.organizationContext).toEqual({
        organizationId: validOrgId,
        accountId: 'acc-1',
        membershipId: 'mem-1',
        role: 'owner',
      });
    });

    it('resolves organizationId from header, trimming whitespace, and attaches organizationContext', async () => {
      const mockMembership = {
        id: 'mem-2',
        organizationId: validOrgId,
        accountId: 'acc-1',
        role: 'admin' as const,
      };
      mockTenants.accountScoped.mockImplementation(
        (
          _accountId: string,
          callback: (tx: {
            membership: { findFirst: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          return callback({
            membership: {
              findFirst: jest.fn().mockResolvedValue(mockMembership),
            },
          });
        },
      );

      const { context, req } = createMockExecutionContext({
        headers: { [ORGANIZATION_HEADER_NAME]: `  ${validOrgId}  ` },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req.organizationContext).toEqual({
        organizationId: validOrgId,
        accountId: 'acc-1',
        membershipId: 'mem-2',
        role: 'admin',
      });
    });

    it('succeeds when param and header provide identical organization IDs', async () => {
      const mockMembership = {
        id: 'mem-3',
        organizationId: validOrgId,
        accountId: 'acc-1',
        role: 'viewer' as const,
      };
      mockTenants.accountScoped.mockImplementation(
        (
          _accountId: string,
          callback: (tx: {
            membership: { findFirst: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          return callback({
            membership: {
              findFirst: jest.fn().mockResolvedValue(mockMembership),
            },
          });
        },
      );

      const { context, req } = createMockExecutionContext({
        params: { organizationId: validOrgId },
        headers: { [ORGANIZATION_HEADER_NAME]: validOrgId },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(req.organizationContext?.role).toBe('viewer');
    });

    it('throws notFound when membership query returns null (account not in org)', async () => {
      mockTenants.accountScoped.mockImplementation(
        (
          _accountId: string,
          callback: (tx: {
            membership: { findFirst: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          return callback({
            membership: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
          });
        },
      );

      const { context, req } = createMockExecutionContext({
        params: { organizationId: validOrgId },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: HttpStatus.NOT_FOUND,
      });
      expect(req.organizationContext).toBeUndefined();
    });
  });

  describe('getOrganizationFromContext', () => {
    it('returns organizationContext when present on request', () => {
      const mockOrgContext: OrganizationContext = {
        organizationId: validOrgId,
        accountId: 'acc-1',
        membershipId: 'mem-1',
        role: 'owner',
      };
      const { context } = createMockExecutionContext({
        organizationContext: mockOrgContext,
      });

      const result = getOrganizationFromContext(null, context);

      expect(result).toEqual(mockOrgContext);
    });

    it('throws error when organizationContext is undefined', () => {
      const { context } = createMockExecutionContext({});

      expect(() => getOrganizationFromContext(null, context)).toThrow(
        'Organization context was not resolved',
      );
    });
  });
});
