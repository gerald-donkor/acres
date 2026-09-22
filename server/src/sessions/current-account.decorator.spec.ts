import type { ExecutionContext } from '@nestjs/common';
import type { AccountProfile } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { RequestWithSession } from './authenticated-request';
import {
  CurrentAccount,
  getAccountFromContext,
} from './current-account.decorator';

describe('CurrentAccount and getAccountFromContext', () => {
  function createMockContext(
    request: Partial<RequestWithSession>,
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

  it('returns account profile when session context is present on request', () => {
    const account: AccountProfile = {
      id: 'acc-123',
      email: 'user@example.com',
      displayName: 'User One',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const ctx = createMockContext({
      sessionContext: {
        account,
        sessionId: 'sess-456',
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    });

    const result = getAccountFromContext(undefined, ctx);
    expect(result).toBe(account);
  });

  it('throws ApiException.unauthenticated when session context is undefined', () => {
    const ctx = createMockContext({});

    expect(() => getAccountFromContext(undefined, ctx)).toThrow(ApiException);
    try {
      getAccountFromContext(undefined, ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const apiErr = err as ApiException;
      expect(apiErr.getStatus()).toBe(401);
      expect(apiErr.code).toBe('UNAUTHENTICATED');
    }
  });

  it('exports CurrentAccount parameter decorator factory', () => {
    expect(CurrentAccount).toBeDefined();
    expect(typeof CurrentAccount).toBe('function');
  });
});
