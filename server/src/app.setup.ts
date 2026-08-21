import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ApiException } from './common/api-exception';
import { ApiExceptionFilter } from './common/api-exception.filter';
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

  app.use(helmet());
  app.enableCors({
    origin: config.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-csrf-token'],
  });
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
