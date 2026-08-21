import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import type { ApiSuccess } from '@acres/shared';

/**
 * Wraps every successful handler return in the `ApiSuccess` envelope, so a
 * client can branch on `ok` without knowing which route it called.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccess<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T>> {
    return next.handle().pipe(map((data) => ({ ok: true as const, data })));
  }
}
