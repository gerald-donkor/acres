import { EventEmitter } from 'node:events';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

describe('MetricsMiddleware', () => {
  let middleware: MetricsMiddleware;
  let mockMetricsService: {
    httpActiveRequests: {
      inc: jest.Mock;
      dec: jest.Mock;
    };
    recordHttpRequest: jest.Mock;
  };
  let next: jest.MockedFunction<NextFunction>;

  class MockResponse extends EventEmitter {
    statusCode?: number;

    constructor(statusCode?: number) {
      super();
      this.statusCode = statusCode;
    }
  }

  function createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      method: 'GET',
      path: '/api/v1/regions',
      ...overrides,
    } as unknown as Request;
  }

  beforeEach(async () => {
    mockMetricsService = {
      httpActiveRequests: {
        inc: jest.fn(),
        dec: jest.fn(),
      },
      recordHttpRequest: jest.fn(),
    };

    next = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsMiddleware,
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    middleware = module.get<MetricsMiddleware>(MetricsMiddleware);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(middleware).toBeDefined();
    expect(middleware).toBeInstanceOf(MetricsMiddleware);
  });

  it('can be instantiated directly via constructor injection', () => {
    const directInstance = new MetricsMiddleware(
      mockMetricsService as unknown as MetricsService,
    );
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(MetricsMiddleware);
  });

  describe('bypass behaviour', () => {
    it('bypasses exact /metrics immediately without incrementing active requests or attaching listeners', () => {
      const req = createMockRequest({ path: '/metrics' });
      const res = new MockResponse(200);
      const onceSpy = jest.spyOn(res, 'once');

      middleware.use(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.httpActiveRequests.inc).not.toHaveBeenCalled();
      expect(onceSpy).not.toHaveBeenCalled();

      res.emit('finish');
      res.emit('close');

      expect(mockMetricsService.httpActiveRequests.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.recordHttpRequest).not.toHaveBeenCalled();
    });

    it('bypasses /metrics/ subpath immediately without incrementing active requests or attaching listeners', () => {
      const req = createMockRequest({ path: '/metrics/subpath' });
      const res = new MockResponse(200);
      const onceSpy = jest.spyOn(res, 'once');

      middleware.use(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.httpActiveRequests.inc).not.toHaveBeenCalled();
      expect(onceSpy).not.toHaveBeenCalled();

      res.emit('finish');
      res.emit('close');

      expect(mockMetricsService.httpActiveRequests.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.recordHttpRequest).not.toHaveBeenCalled();
    });

    it('bypasses nested /metrics/prometheus/scrape subpaths', () => {
      const req = createMockRequest({ path: '/metrics/prometheus/scrape' });
      const res = new MockResponse(200);
      const onceSpy = jest.spyOn(res, 'once');

      middleware.use(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.httpActiveRequests.inc).not.toHaveBeenCalled();
      expect(onceSpy).not.toHaveBeenCalled();
    });

    it('does NOT bypass paths that only share a prefix like /metrics-other', () => {
      const req = createMockRequest({ path: '/metrics-other' });
      const res = new MockResponse(200);
      const onceSpy = jest.spyOn(res, 'once');

      middleware.use(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.httpActiveRequests.inc).toHaveBeenCalledTimes(
        1,
      );
      expect(onceSpy).toHaveBeenCalledTimes(2);
      expect(onceSpy).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(onceSpy).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('normal request processing', () => {
    it('calls next(), increments httpActiveRequests, and attaches finish/close listeners', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/v1/regions' });
      const res = new MockResponse(200);
      const onceSpy = jest.spyOn(res, 'once');

      middleware.use(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.httpActiveRequests.inc).toHaveBeenCalledTimes(
        1,
      );
      expect(onceSpy).toHaveBeenCalledTimes(2);
      expect(onceSpy).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(onceSpy).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockMetricsService.httpActiveRequests.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.recordHttpRequest).not.toHaveBeenCalled();
    });

    it('records metrics and decrements httpActiveRequests when finish event fires', () => {
      const hrtimeSpy = jest.spyOn(process.hrtime, 'bigint');
      hrtimeSpy
        .mockReturnValueOnce(1_000_000_000n) // start
        .mockReturnValueOnce(1_250_000_000n); // end (0.25s)

      const req = createMockRequest({
        method: 'POST',
        path: '/api/v1/datasets',
      });
      const res = new MockResponse(201);

      middleware.use(req, res as unknown as Response, next);

      expect(mockMetricsService.httpActiveRequests.inc).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.httpActiveRequests.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.recordHttpRequest).not.toHaveBeenCalled();

      res.emit('finish');

      expect(mockMetricsService.httpActiveRequests.dec).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'POST',
        '/api/v1/datasets',
        201,
        0.25,
      );
    });

    it('accurately computes durationSeconds without mocked hrtime', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/v1/health' });
      const res = new MockResponse(200);

      middleware.use(req, res as unknown as Response, next);
      res.emit('finish');

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/health',
        200,
        expect.any(Number),
      );
      const recordedCalls = mockMetricsService.recordHttpRequest.mock
        .calls as unknown as [string, string, number, number][];
      expect(recordedCalls[0][3]).toBeGreaterThanOrEqual(0);
    });
  });

  describe('close event handling', () => {
    it('handles close event when finish does not fire (client disconnect)', () => {
      const hrtimeSpy = jest.spyOn(process.hrtime, 'bigint');
      hrtimeSpy
        .mockReturnValueOnce(1_000_000_000n)
        .mockReturnValueOnce(1_100_000_000n); // 0.1s

      const req = createMockRequest({
        method: 'DELETE',
        path: '/api/v1/reports/123',
      });
      const res = new MockResponse(204);

      middleware.use(req, res as unknown as Response, next);

      expect(mockMetricsService.httpActiveRequests.inc).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.httpActiveRequests.dec).not.toHaveBeenCalled();
      expect(mockMetricsService.recordHttpRequest).not.toHaveBeenCalled();

      res.emit('close');

      expect(mockMetricsService.httpActiveRequests.dec).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'DELETE',
        '/api/v1/reports/123',
        204,
        0.1,
      );
    });
  });

  describe('idempotent recording', () => {
    it('ensures recordHttpRequest and httpActiveRequests.dec are only called once when finish fires before close', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/v1/analytics',
      });
      const res = new MockResponse(200);

      middleware.use(req, res as unknown as Response, next);

      res.emit('finish');
      res.emit('close');

      expect(mockMetricsService.httpActiveRequests.dec).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
    });

    it('ensures recordHttpRequest and httpActiveRequests.dec are only called once when close fires before finish', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/v1/analytics',
      });
      const res = new MockResponse(200);

      middleware.use(req, res as unknown as Response, next);

      res.emit('close');
      res.emit('finish');

      expect(mockMetricsService.httpActiveRequests.dec).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
    });

    it('ensures multiple consecutive finish or close events do not trigger multiple metric recordings', () => {
      const req = createMockRequest({
        method: 'GET',
        path: '/api/v1/dashboards',
      });
      const res = new MockResponse(200);

      middleware.use(req, res as unknown as Response, next);

      res.emit('finish');
      res.emit('finish');
      res.emit('close');
      res.emit('close');

      expect(mockMetricsService.httpActiveRequests.dec).toHaveBeenCalledTimes(
        1,
      );
      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('fallback status code', () => {
    it('falls back to 499 when res.statusCode is 0', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/v1/aborted' });
      const res = new MockResponse(0);

      middleware.use(req, res as unknown as Response, next);
      res.emit('close');

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/aborted',
        499,
        expect.any(Number),
      );
    });

    it('falls back to 499 when res.statusCode is undefined', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/v1/aborted' });
      const res = new MockResponse(undefined);

      middleware.use(req, res as unknown as Response, next);
      res.emit('close');

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/aborted',
        499,
        expect.any(Number),
      );
    });

    it('falls back to 499 when res.statusCode is null or NaN', () => {
      const req = createMockRequest({ method: 'GET', path: '/api/v1/aborted' });
      const res = new MockResponse(NaN);

      middleware.use(req, res as unknown as Response, next);
      res.emit('finish');

      expect(mockMetricsService.recordHttpRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/aborted',
        499,
        expect.any(Number),
      );
    });
  });
});
