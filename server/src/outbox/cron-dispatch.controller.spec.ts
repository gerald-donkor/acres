import { Test, TestingModule } from '@nestjs/testing';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { CronDispatchController } from './cron-dispatch.controller';
import {
  ManagedDispatchRunnerService,
  type ManagedSweepResult,
} from './managed-dispatch-runner.service';

describe('CronDispatchController', () => {
  const validSecret = 'a'.repeat(32);
  let controller: CronDispatchController;
  let mockRunner: {
    sweep: jest.Mock;
  };
  let originalEnv: string | undefined;

  const sampleSweepResult: ManagedSweepResult = {
    enabled: true,
    passes: 2,
    stoppedBy: 'drained',
    throttleCleanup: { deleted: 0, failed: false },
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

  beforeEach(async () => {
    originalEnv = process.env.CRON_SECRET;
    process.env.CRON_SECRET = validSecret;

    mockRunner = {
      sweep: jest.fn().mockResolvedValue(sampleSweepResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CronDispatchController],
      providers: [
        {
          provide: ManagedDispatchRunnerService,
          useValue: mockRunner,
        },
      ],
    }).compile();

    controller = module.get<CronDispatchController>(CronDispatchController);
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  function createMockResponse(): {
    res: ExpressResponse;
    statusCalls: number[];
    sentData: string[];
    headers: Record<string, string>;
  } {
    const statusCalls: number[] = [];
    const sentData: string[] = [];
    const headers: Record<string, string> = {};

    const res = {
      status: jest.fn((code: number) => {
        statusCalls.push(code);
        return res;
      }),
      setHeader: jest.fn((key: string, value: string) => {
        headers[key.toLowerCase()] = value;
      }),
      send: jest.fn((data: string) => {
        sentData.push(data);
        return res;
      }),
    } as unknown as ExpressResponse;

    return { res, statusCalls, sentData, headers };
  }

  function createMockRequest(
    authHeader?: string,
    extraHeaders?: Record<string, string>,
  ): ExpressRequest {
    const headers: Record<string, string | undefined> = { ...extraHeaders };
    if (authHeader !== undefined) {
      headers.authorization = authHeader;
    }

    return {
      method: 'GET',
      protocol: 'https',
      get: (header: string) => headers[header.toLowerCase()],
      headers,
      originalUrl: '/cron/dispatch',
      url: '/cron/dispatch',
    } as unknown as ExpressRequest;
  }

  it('returns 503 if CRON_SECRET is missing or invalid', async () => {
    delete process.env.CRON_SECRET;
    const { res, statusCalls, sentData } = createMockResponse();
    const req = createMockRequest(`Bearer ${validSecret}`);

    await controller.dispatch(req, res);

    expect(statusCalls).toEqual([503]);
    expect(JSON.parse(sentData[0])).toEqual({
      ok: false,
      error: 'dispatch_unavailable',
    });
    expect(mockRunner.sweep).not.toHaveBeenCalled();
  });

  it('returns 401 if Authorization header is missing', async () => {
    const { res, statusCalls, sentData } = createMockResponse();
    const req = createMockRequest();

    await controller.dispatch(req, res);

    expect(statusCalls).toEqual([401]);
    expect(JSON.parse(sentData[0])).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(mockRunner.sweep).not.toHaveBeenCalled();
  });

  it('returns 401 if Authorization header has invalid secret', async () => {
    const { res, statusCalls, sentData } = createMockResponse();
    const req = createMockRequest('Bearer wrong-secret');

    await controller.dispatch(req, res);

    expect(statusCalls).toEqual([401]);
    expect(JSON.parse(sentData[0])).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(mockRunner.sweep).not.toHaveBeenCalled();
  });

  it('returns 200 with sweep stats when authorized', async () => {
    const { res, statusCalls, sentData, headers } = createMockResponse();
    const req = createMockRequest(`Bearer ${validSecret}`, {
      'x-vercel-cron-schedule': '0 0 * * *',
    });

    await controller.dispatch(req, res);

    expect(statusCalls).toEqual([200]);
    expect(headers['content-type']).toBe('application/json');
    expect(headers['cache-control']).toBe('no-store');
    const body = JSON.parse(sentData[0]) as Record<string, unknown>;
    expect(body).toEqual({
      ok: true,
      passes: 2,
      stoppedBy: 'drained',
      reconciliation: sampleSweepResult.reconciliation,
      dispatch: sampleSweepResult.dispatch,
      throttleCleanup: { deleted: 0, failed: false },
    });
    expect(mockRunner.sweep).toHaveBeenCalled();
  });

  it('returns 500 if sweep throws', async () => {
    mockRunner.sweep.mockRejectedValueOnce(new Error('database failure'));
    const { res, statusCalls, sentData } = createMockResponse();
    const req = createMockRequest(`Bearer ${validSecret}`);

    await controller.dispatch(req, res);

    expect(statusCalls).toEqual([500]);
    expect(JSON.parse(sentData[0])).toEqual({
      ok: false,
      error: 'dispatch_failed',
    });
  });
});
