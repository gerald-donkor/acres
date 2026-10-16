import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { QueueClient } from '@vercel/queue';
import { AcresConfigService } from '../config/acres-config.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';
import {
  createVercelQueueMiddleware,
  isVercelQueueRequest,
} from './queue-consumer.middleware';

describe('queue-consumer.middleware', () => {
  describe('isVercelQueueRequest', () => {
    it('returns false for non-POST methods', () => {
      const req = {
        method: 'GET',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req)).toBe(false);
    });

    it('returns false for POST without queue headers', () => {
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req)).toBe(false);
    });

    it('returns true for POST with ce-type header', () => {
      const req = {
        method: 'POST',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req)).toBe(true);
    });

    it('returns true for POST with x-vercel-queue-prime header', () => {
      const req = {
        method: 'POST',
        headers: { 'x-vercel-queue-prime': '1' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req)).toBe(true);
    });

    it('returns true for POST with application/cloudevents+json content-type', () => {
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/cloudevents+json' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req)).toBe(true);
    });

    it('returns false for POST targeting /api paths even with queue headers', () => {
      const req1 = {
        method: 'POST',
        path: '/api/v1/auth/login',
        headers: { 'content-type': 'application/cloudevents+json' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req1)).toBe(false);

      const req2 = {
        method: 'POST',
        originalUrl: '/api/v1/uploads',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      expect(isVercelQueueRequest(req2)).toBe(false);
    });
  });

  describe('createVercelQueueMiddleware', () => {
    let mockApp: Partial<INestApplication>;
    let mockConfig: { queueProvider: string; queueBackoffMs: number };
    let mockExecutor: Partial<LeasedJobExecutorService>;

    beforeEach(() => {
      mockConfig = {
        queueProvider: 'vercel',
        queueBackoffMs: 5000,
      };
      mockExecutor = {
        execute: jest.fn(),
      };
      mockApp = {
        get: jest.fn((token: unknown) => {
          if (token === AcresConfigService) return mockConfig;
          if (token === LeasedJobExecutorService) return mockExecutor;
          throw new Error(`Unknown token: ${String(token)}`);
        }) as unknown as INestApplication['get'],
      };
    });

    it('returns a pass-through middleware when queueProvider is not vercel', () => {
      mockConfig.queueProvider = 'memory';
      const middleware = createVercelQueueMiddleware(
        mockApp as INestApplication,
      );
      const req = {
        method: 'POST',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      const res = {} as unknown as Response;
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() for ordinary non-queue requests', () => {
      const middleware = createVercelQueueMiddleware(
        mockApp as INestApplication,
      );
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      } as unknown as Request;
      const res = {} as unknown as Response;
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('delegates to QueueClient handler for queue requests without calling next', () => {
      const mockHandler = jest.fn().mockResolvedValue(undefined);
      const mockQueueClient = {
        handleNodeCallback: jest.fn().mockReturnValue(mockHandler),
      } as unknown as QueueClient;

      const middleware = createVercelQueueMiddleware(
        mockApp as INestApplication,
        mockQueueClient,
      );

      const req = {
        method: 'POST',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      const res = {} as unknown as Response;
      const next = jest.fn();

      middleware(req, res, next);

      expect(mockHandler).toHaveBeenCalledWith(req, res);
      expect(next).not.toHaveBeenCalled();
    });

    it('handles uncaught errors in handler and sends 500 if headers not sent', async () => {
      const mockHandler = jest
        .fn()
        .mockRejectedValue(new Error('Queue fatal failure'));
      const mockQueueClient = {
        handleNodeCallback: jest.fn().mockReturnValue(mockHandler),
      } as unknown as QueueClient;

      const middleware = createVercelQueueMiddleware(
        mockApp as INestApplication,
        mockQueueClient,
      );

      const req = {
        method: 'POST',
        headers: { 'ce-type': 'com.vercel.queue.v2beta' },
      } as unknown as Request;
      const statusFn = jest.fn().mockReturnThis();
      const jsonFn = jest.fn();
      const res = {
        headersSent: false,
        status: statusFn,
        json: jsonFn,
      } as unknown as Response;
      const next = jest.fn();

      middleware(req, res, next);

      // wait for the promise rejection catch handler to run
      await new Promise<void>((resolve) => {
        process.nextTick(resolve);
      });

      expect(statusFn).toHaveBeenCalledWith(500);
      expect(jsonFn).toHaveBeenCalledWith({
        error: 'Failed to process queue message',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
