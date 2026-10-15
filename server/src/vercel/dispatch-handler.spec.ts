import {
  createDispatchHandler,
  type DispatchRuntime,
} from './dispatch-handler';
import type { ManagedSweepResult } from '../outbox/managed-dispatch-runner.service';

describe('createDispatchHandler', () => {
  const validSecret = 'a'.repeat(32);
  let mockRuntime: DispatchRuntime;
  let mockResolveRuntime: jest.Mock;
  let mockReadSecret: jest.Mock;
  let mockLogger: {
    log: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
  };

  const sampleSweepResult: ManagedSweepResult = {
    enabled: true,
    passes: 2,
    stoppedBy: 'drained',
    reconciliation: {
      examined: 20,
      rearmed: 5,
      repaired: 2,
      exhausted: 0,
      rejected: 0,
    },
    dispatch: {
      claimed: 15,
      dispatched: 14,
      retried: 1,
      exhausted: 0,
      rejected: 0,
      lostClaims: 0,
    },
  };

  beforeEach(() => {
    mockRuntime = {
      sweep: jest.fn().mockResolvedValue(sampleSweepResult),
    };
    mockResolveRuntime = jest.fn().mockResolvedValue(mockRuntime);
    mockReadSecret = jest.fn().mockReturnValue(validSecret);
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
  });

  function createHandler() {
    return createDispatchHandler({
      resolveRuntime: mockResolveRuntime,
      readSecret: mockReadSecret,
      logger: mockLogger,
    });
  }

  function createRequest(
    authHeader?: string,
    extraHeaders?: Record<string, string>,
  ): Request {
    const headersMap = new Map<string, string>();
    if (authHeader !== undefined) {
      headersMap.set('authorization', authHeader);
    }
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) {
        headersMap.set(k.toLowerCase(), v);
      }
    }
    return {
      headers: {
        get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
      },
    } as unknown as Request;
  }

  describe('secret configuration checks (503 without resolveRuntime)', () => {
    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['short (31 chars)', 'a'.repeat(31)],
      ['leading whitespace', ` ${'a'.repeat(32)}`],
      ['trailing whitespace', `${'a'.repeat(32)} `],
      ['placeholder change-me', `change-me-${'a'.repeat(30)}`],
      ['placeholder __REQUIRED_', `__REQUIRED_${'a'.repeat(30)}`],
    ])(
      'returns 503 dispatch_unavailable for %s secret without booting runtime',
      async (_desc, secretValue) => {
        mockReadSecret.mockReturnValue(secretValue);
        const handler = createHandler();
        const request = createRequest(`Bearer ${validSecret}`);

        const response = await handler(request);

        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Content-Type')).toBe('application/json');
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toEqual({ ok: false, error: 'dispatch_unavailable' });
        expect(mockResolveRuntime).not.toHaveBeenCalled();
      },
    );
  });

  describe('authentication checks (401 without resolveRuntime)', () => {
    it.each([
      ['missing Authorization header', undefined],
      ['empty Authorization header', ''],
      ['wrong secret', `Bearer ${'b'.repeat(32)}`],
      ['lowercase bearer scheme', `bearer ${validSecret}`],
      ['uppercase BEARER scheme', `BEARER ${validSecret}`],
      ['double space after Bearer', `Bearer  ${validSecret}`],
      ['leading space in header', ` Bearer ${validSecret}`],
      ['trailing space in header', `Bearer ${validSecret} `],
      ['empty token after Bearer', 'Bearer '],
      ['secret-prefix match only', `Bearer ${validSecret.slice(0, 20)}`],
      ['secret-suffix extra chars', `Bearer ${validSecret}extra`],
    ])(
      'returns 401 unauthorized for %s without logging or booting runtime',
      async (_desc, authHeader) => {
        const handler = createHandler();
        const request = createRequest(authHeader);

        const response = await handler(request);

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Content-Type')).toBe('application/json');
        const body = (await response.json()) as Record<string, unknown>;
        expect(body).toEqual({ ok: false, error: 'unauthorized' });
        expect(mockResolveRuntime).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.log).not.toHaveBeenCalled();
      },
    );
  });

  describe('runtime resolution failure (503 and retries)', () => {
    it('returns 503 dispatch_unavailable when resolveRuntime rejects', async () => {
      mockResolveRuntime.mockRejectedValueOnce(
        new Error('database offline at boot'),
      );
      const handler = createHandler();
      const request = createRequest(`Bearer ${validSecret}`);

      const response = await handler(request);

      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({ ok: false, error: 'dispatch_unavailable' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Dispatch runtime resolution failed.',
      );
      // Detailed error string is not echoed in body or log
      expect(JSON.stringify(body)).not.toContain('database offline');
      const errorCalls = mockLogger.error.mock.calls as [string][];
      expect(errorCalls[0][0]).not.toContain('database offline');
    });
  });

  describe('sweep execution failure (500)', () => {
    it('returns 500 dispatch_failed when sweep() rejects without leaking error text', async () => {
      (mockRuntime.sweep as jest.Mock).mockRejectedValueOnce(
        new Error('fatal dead letter lock timeout'),
      );
      const handler = createHandler();
      const request = createRequest(`Bearer ${validSecret}`);

      const response = await handler(request);

      expect(response.status).toBe(500);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({ ok: false, error: 'dispatch_failed' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Managed outbox dispatch sweep failed.',
      );
      expect(JSON.stringify(body)).not.toContain('lock timeout');
    });
  });

  describe('successful sweep (200 with global counts and no IDs)', () => {
    it('returns 200 with global counts and logs completion including x-vercel-cron-schedule', async () => {
      const handler = createHandler();
      const request = createRequest(`Bearer ${validSecret}`, {
        'x-vercel-cron-schedule': '0 0 * * *',
      });

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({
        ok: true,
        passes: 2,
        stoppedBy: 'drained',
        reconciliation: sampleSweepResult.reconciliation,
        dispatch: sampleSweepResult.dispatch,
      });

      // Assert no entity IDs, account IDs, or tenant IDs appear in response
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain('id');
      expect(bodyStr).not.toContain('org-');
      expect(bodyStr).not.toContain('acc-');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Managed outbox sweep completed: passes=2 stoppedBy=drained dispatched=14 rearmed=5 schedule=0 0 * * *',
        ),
      );
    });

    it('handles absence of x-vercel-cron-schedule gracefully', async () => {
      const handler = createHandler();
      const request = createRequest(`Bearer ${validSecret}`);

      const response = await handler(request);

      expect(response.status).toBe(200);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Managed outbox sweep completed: passes=2 stoppedBy=drained dispatched=14 rearmed=5',
      );
    });
  });
});
