import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants';
import { map, Observable } from 'rxjs';
import type { ApiSuccess } from '@acres/shared';

/**
 * Wraps every successful handler return in the `ApiSuccess` envelope, so a
 * client can branch on `ok` without knowing which route it called.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccess<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T> | T> {
    if (context.getType<string>() !== 'http') {
      return next.handle();
    }
    const handler = context.getHandler();
    if (Reflect.getMetadata(SSE_METADATA, handler)) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<{ path?: string }>();
    if (request?.path === '/metrics' || request?.path?.endsWith('/events')) {
      return next.handle();
    }
    return next.handle().pipe(map((data) => ({ ok: true as const, data })));
  }
}
