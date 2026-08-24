import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@acres/shared';

/**
 * Every error this API raises carries a stable `code`. The exception filter
 * turns it into the `ApiError` envelope `@acres/shared` declares.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: string[],
  ) {
    super({ code, message, details }, status);
  }

  static validationFailed(details: string[]): ApiException {
    return new ApiException(
      'VALIDATION_FAILED',
      'The submitted values are not valid.',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  /**
   * One shape for "wrong password", "no such account" and "email already
   * registered", so the response never reveals whether an account exists.
   */
  static invalidCredentials(): ApiException {
    return new ApiException(
      'INVALID_CREDENTIALS',
      'Those credentials did not work.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  static unauthenticated(): ApiException {
    return new ApiException(
      'UNAUTHENTICATED',
      'Sign in to continue.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(
    message = 'You do not have permission to do that.',
  ): ApiException {
    return new ApiException('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  static conflict(message: string): ApiException {
    return new ApiException('CONFLICT', message, HttpStatus.CONFLICT);
  }

  static notFound(message: string): ApiException {
    return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }

  static notReady(): ApiException {
    return new ApiException(
      'NOT_READY',
      'The database is not reachable.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
