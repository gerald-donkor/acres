import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerRequest, ThrottlerStorage } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AcresThrottlerGuard,
  DEFAULT_THROTTLER_NAME,
  STRICT_THROTTLER_NAME,
  THROTTLER_TIERS,
} from './rate-limit.guard';
import { STRICT_THROTTLE_KEY } from './strict-throttle.decorator';
import type { AcresGraphqlContext } from '../graphql/graphql.context';

class TestAcresThrottlerGuard extends AcresThrottlerGuard {
  public override handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    return super.handleRequest(requestProps);
  }

  public override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    return super.getRequestResponse(context);
  }
}

describe('AcresThrottlerGuard', () => {
  describe('exported constants', () => {
    it('exports canonical THROTTLER_TIERS tuple', () => {
      expect(THROTTLER_TIERS).toEqual(['default', 'strict']);
    });

    it('exports DEFAULT_THROTTLER_NAME as default', () => {
      expect(DEFAULT_THROTTLER_NAME).toBe('default');
    });

    it('exports STRICT_THROTTLER_NAME as strict', () => {
      expect(STRICT_THROTTLER_NAME).toBe('strict');
    });
  });

  function createMockStorage(): {
    storage: ThrottlerStorage;
    incrementSpy: jest.Mock;
  } {
    const incrementSpy = jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    const storage: ThrottlerStorage = {
      increment: incrementSpy,
    };
    return { storage, incrementSpy };
  }

  function createMockReflector(): Reflector {
    return {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
  }

  function createMockHttpContext(
    handler: () => void = function mockHandler() {},
    controllerClass: new () => object = class MockController {},
  ): {
    context: ExecutionContext;
    req: Request;
    res: Response;
    headerSpy: jest.Mock;
  } {
    const req = {
      ip: '127.0.0.1',
      headers: {},
    } as unknown as Request;

    const headerSpy = jest.fn();
    const res = {
      header: headerSpy,
    } as unknown as Response;

    const context: Partial<ExecutionContext> = {
      getType: jest.fn().mockReturnValue('http'),
      getHandler: jest.fn().mockReturnValue(handler),
      getClass: jest.fn().mockReturnValue(controllerClass),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getArgs: jest.fn().mockReturnValue([req, res]),
    };

    return {
      context: context as ExecutionContext,
      req,
      res,
      headerSpy,
    };
  }

  function createMockGraphqlContext(
    handler: () => void = function mockResolver() {},
    resolverClass: new () => object = class MockResolver {},
  ): {
    context: ExecutionContext;
    req: Request;
    res: Response;
  } {
    const req = {
      ip: '10.0.0.1',
      headers: {},
    } as unknown as Request;

    const res = {
      header: jest.fn(),
    } as unknown as Response;

    const graphqlContext = {
      req,
      res,
    } as AcresGraphqlContext;

    const context: Partial<ExecutionContext> = {
      getType: jest.fn().mockReturnValue('graphql'),
      getHandler: jest.fn().mockReturnValue(handler),
      getClass: jest.fn().mockReturnValue(resolverClass),
      getArgs: jest.fn().mockReturnValue([null, {}, graphqlContext, null]),
    };

    return {
      context: context as ExecutionContext,
      req,
      res,
    };
  }

  describe('handleRequest and tier routing', () => {
    it('bypasses strict throttler when route and class lack strict throttle metadata', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      const getAllAndOverrideSpy = jest.spyOn(reflector, 'getAllAndOverride');
      getAllAndOverrideSpy.mockImplementation((key: unknown) => {
        if (key === STRICT_THROTTLE_KEY) return false;
        return undefined;
      });

      const guard = new TestAcresThrottlerGuard(
        {
          throttlers: [
            { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
            { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
          ],
        },
        storage,
        reflector,
      );
      await guard.onModuleInit();

      const { context } = createMockHttpContext();
      const requestProps: ThrottlerRequest = {
        context,
        limit: 10,
        ttl: 60000,
        throttler: { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
        blockDuration: 60000,
        getTracker: jest.fn().mockResolvedValue('127.0.0.1'),
        generateKey: jest.fn().mockReturnValue('key-strict'),
      };

      const result = await guard.handleRequest(requestProps);

      expect(result).toBe(true);
      expect(getAllAndOverrideSpy).toHaveBeenCalledWith(STRICT_THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      expect(incrementSpy).not.toHaveBeenCalled();
    });

    it('enforces strict throttler when handler has strict throttle metadata', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => {
          if (key === STRICT_THROTTLE_KEY) return true;
          return undefined;
        });

      const guard = new TestAcresThrottlerGuard(
        {
          throttlers: [
            { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
            { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
          ],
        },
        storage,
        reflector,
      );
      await guard.onModuleInit();

      const { context, headerSpy } = createMockHttpContext();
      const requestProps: ThrottlerRequest = {
        context,
        limit: 10,
        ttl: 60000,
        throttler: { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
        blockDuration: 60000,
        getTracker: jest.fn().mockResolvedValue('127.0.0.1'),
        generateKey: jest.fn().mockReturnValue('key-strict'),
      };

      const result = await guard.handleRequest(requestProps);

      expect(result).toBe(true);
      expect(incrementSpy).toHaveBeenCalledWith(
        'key-strict',
        60000,
        10,
        60000,
        STRICT_THROTTLER_NAME,
      );
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit-strict', 10);
    });

    it('enforces strict throttler when controller class has strict throttle metadata', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown, targets: unknown) => {
          if (
            key === STRICT_THROTTLE_KEY &&
            Array.isArray(targets) &&
            targets.length === 2
          ) {
            return true;
          }
          return undefined;
        });

      const guard = new TestAcresThrottlerGuard(
        {
          throttlers: [
            { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
            { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
          ],
        },
        storage,
        reflector,
      );
      await guard.onModuleInit();

      const { context, headerSpy } = createMockHttpContext();
      const requestProps: ThrottlerRequest = {
        context,
        limit: 10,
        ttl: 60000,
        throttler: { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
        blockDuration: 60000,
        getTracker: jest.fn().mockResolvedValue('127.0.0.1'),
        generateKey: jest.fn().mockReturnValue('key-strict-class'),
      };

      const result = await guard.handleRequest(requestProps);

      expect(result).toBe(true);
      expect(incrementSpy).toHaveBeenCalledWith(
        'key-strict-class',
        60000,
        10,
        60000,
        STRICT_THROTTLER_NAME,
      );
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit-strict', 10);
    });

    it('always delegates to super.handleRequest for default throttler', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => {
          if (key === STRICT_THROTTLE_KEY) return false;
          return undefined;
        });

      const guard = new TestAcresThrottlerGuard(
        {
          throttlers: [
            { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
            { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
          ],
        },
        storage,
        reflector,
      );
      await guard.onModuleInit();

      const { context, headerSpy } = createMockHttpContext();
      const requestProps: ThrottlerRequest = {
        context,
        limit: 100,
        ttl: 60000,
        throttler: { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
        blockDuration: 60000,
        getTracker: jest.fn().mockResolvedValue('127.0.0.1'),
        generateKey: jest.fn().mockReturnValue('key-default'),
      };

      const result = await guard.handleRequest(requestProps);

      expect(result).toBe(true);
      expect(incrementSpy).toHaveBeenCalledWith(
        'key-default',
        60000,
        100,
        60000,
        DEFAULT_THROTTLER_NAME,
      );
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    });
  });

  describe('getRequestResponse context unwrapping', () => {
    it('unwraps HTTP execution context via switchToHttp', () => {
      const { storage } = createMockStorage();
      const reflector = createMockReflector();
      const guard = new TestAcresThrottlerGuard([], storage, reflector);

      const { context, req, res } = createMockHttpContext();
      const extracted = guard.getRequestResponse(context);

      expect(extracted).toEqual({ req, res });
    });

    it('unwraps GraphQL execution context via GqlExecutionContext', () => {
      const { storage } = createMockStorage();
      const reflector = createMockReflector();
      const guard = new TestAcresThrottlerGuard([], storage, reflector);

      const { context, req, res } = createMockGraphqlContext();
      const extracted = guard.getRequestResponse(context);

      expect(extracted).toEqual({ req, res });
    });
  });

  describe('canActivate lifecycle end-to-end', () => {
    it('evaluates both default and strict throttlers when initialized on strict route', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => {
          if (key === STRICT_THROTTLE_KEY) return true;
          return undefined;
        });

      const guard = new TestAcresThrottlerGuard(
        [
          { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
          { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
        ],
        storage,
        reflector,
      );

      await guard.onModuleInit();

      const { context } = createMockHttpContext();
      const allowed = await guard.canActivate(context);

      expect(allowed).toBe(true);
      // Both default and strict increment storage
      expect(incrementSpy).toHaveBeenCalledTimes(2);
    });

    it('bypasses strict storage increment on non-strict route during canActivate', async () => {
      const { storage, incrementSpy } = createMockStorage();
      const reflector = createMockReflector();
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => {
          if (key === STRICT_THROTTLE_KEY) return false;
          return undefined;
        });

      const guard = new TestAcresThrottlerGuard(
        [
          { name: DEFAULT_THROTTLER_NAME, ttl: 60000, limit: 100 },
          { name: STRICT_THROTTLER_NAME, ttl: 60000, limit: 10 },
        ],
        storage,
        reflector,
      );

      await guard.onModuleInit();

      const { context } = createMockHttpContext();
      const allowed = await guard.canActivate(context);

      expect(allowed).toBe(true);
      // Only default throttler increments storage; strict throttler is bypassed in handleRequest
      expect(incrementSpy).toHaveBeenCalledTimes(1);
    });
  });
});
