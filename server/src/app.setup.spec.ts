import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  CSRF_HEADER_NAME,
  IDEMPOTENCY_HEADER_NAME,
  ORGANIZATION_HEADER_NAME,
  REQUEST_ID_HEADER_NAME,
} from '@acres/shared';
import { configureApp } from './app.setup';
import { ApiException } from './common/api-exception';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestContextMiddleware } from './common/request-context';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AcresConfigService } from './config/acres-config.service';
import { CsrfService } from './security/csrf.service';

type StandardMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

type ErrorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

interface RegisteredMiddleware {
  path?: string;
  handler: StandardMiddleware | ErrorMiddleware;
}

interface ValidationPipeOptionsAccessor {
  isTransformEnabled: boolean;
  exceptionFactory: (errors: unknown[]) => ApiException;
}

describe('app.setup', () => {
  let mockApp: {
    get: jest.Mock;
    setGlobalPrefix: jest.Mock;
    enableVersioning: jest.Mock;
    enableCors: jest.Mock;
    use: jest.Mock;
    useGlobalPipes: jest.Mock;
    useGlobalInterceptors: jest.Mock;
    useGlobalFilters: jest.Mock;
    enableShutdownHooks: jest.Mock;
  };
  let app: INestApplication;
  let mockConfig: { clientOrigin: string; graphqlMaxBytes: number };
  let mockCsrfService: { protection: jest.Mock };
  let registeredMiddlewares: RegisteredMiddleware[];

  beforeEach(() => {
    registeredMiddlewares = [];
    mockConfig = {
      clientOrigin: 'http://localhost:3000',
      graphqlMaxBytes: 1048576,
    };
    mockCsrfService = {
      protection: jest.fn(),
    };

    mockApp = {
      get: jest.fn((token: unknown) => {
        if (token === AcresConfigService) return mockConfig;
        if (token === CsrfService) return mockCsrfService;
        return null;
      }),
      setGlobalPrefix: jest.fn(),
      enableVersioning: jest.fn(),
      enableCors: jest.fn(),
      use: jest.fn((...args: unknown[]) => {
        if (typeof args[0] === 'string') {
          registeredMiddlewares.push({
            path: args[0],
            handler: args[1] as StandardMiddleware,
          });
        } else {
          registeredMiddlewares.push({
            handler: args[0] as StandardMiddleware | ErrorMiddleware,
          });
        }
        return mockApp;
      }),
      useGlobalPipes: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableShutdownHooks: jest.fn(),
    };
    app = mockApp as unknown as INestApplication;
  });

  describe('configureApp', () => {
    it('configures global prefix api with health and metrics excluded', () => {
      configureApp(app);

      expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api', {
        exclude: [
          { path: 'health', method: RequestMethod.GET },
          { path: 'health/ready', method: RequestMethod.GET },
          { path: 'metrics', method: RequestMethod.GET },
          { path: 'graphql', method: RequestMethod.POST },
          { path: 'graphql', method: RequestMethod.GET },
        ],
      });
    });

    it('enables URI versioning', () => {
      configureApp(app);
      expect(mockApp.enableVersioning).toHaveBeenCalledWith({
        type: VersioningType.URI,
      });
    });

    it('enables CORS with clientOrigin and allowed headers', () => {
      configureApp(app);

      expect(mockApp.enableCors).toHaveBeenCalledWith({
        origin: 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          IDEMPOTENCY_HEADER_NAME,
          'Idempotency-Key',
          ORGANIZATION_HEADER_NAME,
          CSRF_HEADER_NAME,
          'x-organization-id',
          REQUEST_ID_HEADER_NAME,
        ],
        exposedHeaders: [REQUEST_ID_HEADER_NAME],
      });
    });

    it('registers core middlewares including request context and CSRF protection', () => {
      configureApp(app);

      expect(mockApp.use).toHaveBeenCalledWith(requestContextMiddleware);
      expect(mockApp.use).toHaveBeenCalledWith(mockCsrfService.protection);
    });

    it('registers global interceptors, filters, and shutdown hooks', () => {
      configureApp(app);

      expect(mockApp.useGlobalInterceptors).toHaveBeenCalledWith(
        expect.any(ResponseEnvelopeInterceptor),
      );
      expect(mockApp.useGlobalFilters).toHaveBeenCalledWith(
        expect.any(ApiExceptionFilter),
      );
      expect(mockApp.enableShutdownHooks).toHaveBeenCalled();
    });

    it('configures ValidationPipe with whitelist, forbidNonWhitelisted, and custom exceptionFactory', () => {
      configureApp(app);

      expect(mockApp.useGlobalPipes).toHaveBeenCalledWith(
        expect.any(ValidationPipe),
      );
      const pipes = mockApp.useGlobalPipes.mock.calls[0] as unknown[];
      const pipeCall = pipes[0] as ValidationPipeOptionsAccessor;
      expect(pipeCall.isTransformEnabled).toBe(true);

      const exception = pipeCall.exceptionFactory([
        {
          property: 'email',
          constraints: { isEmail: 'email must be valid' },
        },
      ]);
      expect(exception.getStatus()).toBe(400);
      expect(exception.code).toBe('VALIDATION_FAILED');
      expect(exception.details).toContain('email must be valid');
    });
  });

  describe('graphql method guard middleware', () => {
    it('rejects GET /graphql with 405 Method Not Allowed', () => {
      configureApp(app);
      const graphqlMw = registeredMiddlewares.find(
        (m) => m.path === '/graphql',
      );
      expect(graphqlMw).toBeDefined();

      const req = { method: 'GET' } as Request;
      const resJson = jest.fn();
      const resStatus = jest.fn().mockReturnValue({ json: resJson });
      const res = {
        status: resStatus,
        getHeader: jest.fn().mockReturnValue('req-123'),
      } as unknown as Response;
      const next = jest.fn();

      (graphqlMw!.handler as StandardMiddleware)(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(405);
      expect(resJson).toHaveBeenCalledWith({
        errors: [
          {
            message: 'GraphQL operations require POST.',
            extensions: {
              code: 'METHOD_NOT_ALLOWED',
              requestId: 'req-123',
            },
          },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards non-GET /graphql requests to next', () => {
      configureApp(app);
      const graphqlMw = registeredMiddlewares.find(
        (m) => m.path === '/graphql',
      );

      const req = { method: 'POST' } as Request;
      const res = {} as Response;
      const next = jest.fn();

      (graphqlMw!.handler as StandardMiddleware)(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('bodyParserError middleware', () => {
    let bodyParserMw: ErrorMiddleware;

    beforeEach(() => {
      configureApp(app);
      const entry = registeredMiddlewares.find(
        (m) => !m.path && m.handler.length === 4,
      );
      expect(entry).toBeDefined();
      bodyParserMw = entry!.handler as ErrorMiddleware;
    });

    it('handles payload too large on /graphql path with 200 GraphQL error', () => {
      const err = { type: 'entity.too.large' };
      const req = {
        path: '/graphql',
        requestContext: { requestId: 'req-gql' },
      } as unknown as Request;
      const resJson = jest.fn();
      const resStatus = jest.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus } as unknown as Response;
      const next = jest.fn();

      bodyParserMw(err, req, res, next);

      expect(resStatus).toHaveBeenCalledWith(200);
      expect(resJson).toHaveBeenCalledWith({
        errors: [
          {
            message: 'GraphQL request exceeds the configured byte limit.',
            extensions: {
              code: 'QUERY_LIMIT_EXCEEDED',
              requestId: 'req-gql',
            },
          },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('handles payload too large on REST path with 413 QUERY_LIMIT_EXCEEDED envelope', () => {
      const err = { type: 'entity.too.large' };
      const req = {
        path: '/api/v1/datasets',
        requestContext: { requestId: 'req-rest' },
      } as unknown as Request;
      const resJson = jest.fn();
      const resStatus = jest.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus } as unknown as Response;
      const next = jest.fn();

      bodyParserMw(err, req, res, next);

      expect(resStatus).toHaveBeenCalledWith(413);
      expect(resJson).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: 'QUERY_LIMIT_EXCEEDED',
          message: 'Request body exceeds the configured byte limit.',
          requestId: 'req-rest',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('handles malformed JSON syntax error with 400 VALIDATION_FAILED envelope', () => {
      const err = Object.assign(new SyntaxError('Unexpected token'), {
        body: '{ invalid json',
      });
      const req = {
        path: '/api/v1/auth/login',
        requestContext: { requestId: 'req-syntax' },
      } as unknown as Request;
      const resJson = jest.fn();
      const resStatus = jest.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus } as unknown as Response;
      const next = jest.fn();

      bodyParserMw(err, req, res, next);

      expect(resStatus).toHaveBeenCalledWith(400);
      expect(resJson).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request body must be valid JSON.',
          requestId: 'req-syntax',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards other errors to next', () => {
      const err = new Error('Generic error');
      const req = { path: '/api/v1/datasets', headers: {} } as Request;
      const res = {} as Response;
      const next = jest.fn();

      bodyParserMw(err, req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
