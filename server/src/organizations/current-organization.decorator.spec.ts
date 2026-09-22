import type { ExecutionContext } from '@nestjs/common';
import {
  CurrentOrganization,
  getOrganizationFromContext,
} from './current-organization.decorator';
import type {
  OrganizationContext,
  RequestWithOrganization,
} from './organization-context';

describe('CurrentOrganization and getOrganizationFromContext', () => {
  function createMockContext(
    request: Partial<RequestWithOrganization>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: jest.fn(),
        getNext: jest.fn(),
      }),
      getClass: jest.fn(),
      getHandler: jest.fn(),
      getArgs: jest.fn(),
      getArgByIndex: jest.fn(),
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: jest.fn(),
    } as unknown as ExecutionContext;
  }

  it('returns organization context when present on request', () => {
    const orgContext: OrganizationContext = {
      organizationId: 'org-123',
      accountId: 'acc-456',
      membershipId: 'mem-789',
      role: 'admin',
    };
    const ctx = createMockContext({ organizationContext: orgContext });

    const result = getOrganizationFromContext(undefined, ctx);
    expect(result).toBe(orgContext);
  });

  it('throws Error when organization context is undefined', () => {
    const ctx = createMockContext({});

    expect(() => getOrganizationFromContext(undefined, ctx)).toThrow(
      'Organization context was not resolved',
    );
  });

  it('exports CurrentOrganization parameter decorator factory', () => {
    expect(CurrentOrganization).toBeDefined();
    expect(typeof CurrentOrganization).toBe('function');
  });
});
