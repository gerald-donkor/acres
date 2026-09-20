import { ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { OrganizationPermission, OrganizationRole } from '@acres/shared';
import {
  ORGANIZATION_PERMISSION_KEY,
  ORGANIZATION_PERMISSIONS,
} from './permissions';
import { PermissionGuard } from './permission.guard';
import type {
  OrganizationContext,
  RequestWithOrganization,
} from './organization-context';

function createMockExecutionContext(
  request: Partial<RequestWithOrganization> = {},
): ExecutionContext {
  const req = request as RequestWithOrganization;
  const mockHandler = () => {};
  class MockClass {}

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getType: () => 'http',
    getClass: () => MockClass,
    getHandler: () => mockHandler,
    getArgs: () => [req],
    getArgByIndex: () => req,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let mockReflector: {
    getAllAndOverride: jest.Mock;
  };
  let guard: PermissionGuard;

  function assertGuardThrows(
    context: ExecutionContext,
    expected: { code: string; status: number },
  ) {
    let error: unknown;
    try {
      guard.canActivate(context);
    } catch (err) {
      error = err;
    }
    expect(error).toMatchObject(expected);
  }

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionGuard(mockReflector as unknown as Reflector);
  });

  it('returns true immediately when no permission metadata is set', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(undefined);
    const context = createMockExecutionContext();

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
      ORGANIZATION_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
  });

  it('throws notFound when permission is required but organizationContext is missing', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(
      'reports.read' satisfies OrganizationPermission,
    );
    const context = createMockExecutionContext({});

    assertGuardThrows(context, {
      code: 'NOT_FOUND',
      status: HttpStatus.NOT_FOUND,
    });
  });

  describe('Role-based permission evaluation', () => {
    function createContextWithRole(role: OrganizationRole): ExecutionContext {
      const organizationContext: OrganizationContext = {
        organizationId: 'org-1',
        accountId: 'acc-1',
        membershipId: 'mem-1',
        role,
      };
      return createMockExecutionContext({ organizationContext });
    }

    it('allows owner role for all organization permissions', () => {
      const context = createContextWithRole('owner');

      for (const permission of ORGANIZATION_PERMISSIONS) {
        mockReflector.getAllAndOverride.mockReturnValueOnce(permission);
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('allows admin role for administrative and report actions, but rejects ownership.transfer', () => {
      const context = createContextWithRole('admin');

      mockReflector.getAllAndOverride.mockReturnValueOnce('members.invite');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('reports.publish');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('ownership.transfer');
      assertGuardThrows(context, {
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('allows analyst role for datasets, analytics, and reports, but rejects member administration', () => {
      const context = createContextWithRole('analyst');

      mockReflector.getAllAndOverride.mockReturnValueOnce('datasets.create');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('analytics.read');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('members.invite');
      assertGuardThrows(context, {
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('allows viewer role for read permissions, but rejects mutations and administration', () => {
      const context = createContextWithRole('viewer');

      mockReflector.getAllAndOverride.mockReturnValueOnce('reports.read');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('analytics.read');
      expect(guard.canActivate(context)).toBe(true);

      mockReflector.getAllAndOverride.mockReturnValueOnce('reports.create');
      assertGuardThrows(context, {
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });

      mockReflector.getAllAndOverride.mockReturnValueOnce('uploads.create');
      assertGuardThrows(context, {
        code: 'FORBIDDEN',
        status: HttpStatus.FORBIDDEN,
      });
    });
  });

  describe('Metadata resolution', () => {
    it('passes handler and class targets to reflector.getAllAndOverride', () => {
      mockReflector.getAllAndOverride.mockReturnValueOnce('organization.read');
      const context = createMockExecutionContext({
        organizationContext: {
          organizationId: 'org-1',
          accountId: 'acc-1',
          membershipId: 'mem-1',
          role: 'viewer',
        },
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        ORGANIZATION_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );
    });
  });
});
