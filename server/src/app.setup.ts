import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ApiException } from './common/api-exception';
import { ApiExceptionFilter } from './common/api-exception.filter';
import {
  requestContextMiddleware,
  requestIdFrom,
} from './common/request-context';
import { ResponseEnvelopeInterceptor } from './common/response-envelope.interceptor';
import { AcresConfigService } from './config/acres-config.service';
import { CsrfService } from './security/csrf.service';

/**
 * Every cross-cutting concern the HTTP surface depends on, in one place, so
 * the tests exercise the same stack `main.ts` serves — a validation or CSRF
 * rule configured only in `main.ts` is a rule no test can see.
 *
 * Order matters. Headers first, then origin policy, then cookies — the CSRF
 * middleware reads cookies, so it cannot run before the parser.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AcresConfigService);

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'graphql', method: RequestMethod.POST },
      { path: 'graphql', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI });
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: config.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Idempotency-Key',
      'x-acres-organization-id',
      'x-csrf-token',
      'x-organization-id',
      'x-request-id',
    ],
    exposedHeaders: ['x-request-id'],
  });
  app.use(
    '/graphql',
    (request: Request, response: Response, next: NextFunction) => {
      if (request.method === 'GET') {
        response.status(405).json({
          errors: [
            {
              message: 'GraphQL operations require POST.',
              extensions: {
                code: 'METHOD_NOT_ALLOWED',
                requestId: response.getHeader('x-request-id'),
              },
            },
          ],
        });
        return;
      }
      next();
    },
  );
  app.use(express.json({ limit: config.graphqlMaxBytes }));
  app.use(
    express.urlencoded({ extended: false, limit: config.graphqlMaxBytes }),
  );
  app.use(bodyParserError);
  app.use(cookieParser());
  app.use(app.get(CsrfService).protection);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (errors) =>
        ApiException.validationFailed(
          errors.flatMap((error) =>
            Object.values(error.constraints ?? { unknown: error.property }),
          ),
        ),
    }),
  );
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}

function bodyParserError(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = requestIdFrom(request);
  if (isPayloadTooLarge(error)) {
    if (request.path === '/graphql') {
      response.status(200).json({
        errors: [
          {
            message: 'GraphQL request exceeds the configured byte limit.',
            extensions: { code: 'QUERY_LIMIT_EXCEEDED', requestId },
          },
        ],
      });
      return;
    }
    response.status(413).json({
      ok: false,
      error: {
        code: 'QUERY_LIMIT_EXCEEDED',
        message: 'Request body exceeds the configured byte limit.',
        ...(requestId ? { requestId } : {}),
      },
    });
    return;
  }
  if (isMalformedJson(error)) {
    response.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request body must be valid JSON.',
        ...(requestId ? { requestId } : {}),
      },
    });
    return;
  }
  next(error);
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: string }).type === 'entity.too.large'
  );
}

function isMalformedJson(error: unknown): boolean {
  return error instanceof SyntaxError && 'body' in error;
}
