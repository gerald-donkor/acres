import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError, ApiErrorCode } from '@acres/shared';
import { requestIdFrom } from './request-context';

const STATUS_CODES: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'NOT_READY',
};

/**
 * Turns anything thrown into the `ApiError` envelope. Unrecognised throwables
 * become a generic `INTERNAL_ERROR` — the real reason is logged, never sent.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType<string>() !== 'http') {
      throw exception;
    }
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = requestIdFrom(request);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).json(this.toEnvelope(status, payload, requestId));
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        ...(requestId ? { requestId } : {}),
      },
    } satisfies ApiError);
  }

  private toEnvelope(
    status: number,
    payload: unknown,
    requestId?: string,
  ): ApiError {
    const fallbackCode: ApiErrorCode = STATUS_CODES[status] ?? 'INTERNAL_ERROR';

    if (payload && typeof payload === 'object') {
      const body = payload as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
      };
      return {
        ok: false,
        error: {
          code:
            typeof body.code === 'string'
              ? (body.code as ApiErrorCode)
              : fallbackCode,
          message:
            typeof body.message === 'string' ? body.message : 'Request failed.',
          ...(Array.isArray(body.details)
            ? { details: body.details as string[] }
            : {}),
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    return {
      ok: false,
      error: {
        code: fallbackCode,
        message: typeof payload === 'string' ? payload : 'Request failed.',
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}
