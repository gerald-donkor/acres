import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiException } from './api-exception';
import type { RequestWithContext } from './request-context';

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;
  let mockRequest: Partial<RequestWithContext>;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let mockHost: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new ApiExceptionFilter();
    mockRequest = {
      requestContext: { requestId: 'test-req-123' },
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      getType: jest.fn().mockReturnValue('http'),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest as Request,
        getResponse: () => mockResponse as unknown as Response,
      }),
    } as unknown as ArgumentsHost;

    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('re-throws when host type is not http', () => {
    (mockHost.getType as jest.Mock).mockReturnValue('rpc');
    const err = new Error('RPC error');
    expect(() => filter.catch(err, mockHost)).toThrow(err);
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  it('formats an ApiException with code, message, details, and requestId', () => {
    const exception = ApiException.validationFailed(['username is required']);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The submitted values are not valid.',
        details: ['username is required'],
        requestId: 'test-req-123',
      },
    });
  });

  it('omits requestId when requestContext has no requestId', () => {
    mockRequest.requestContext = { requestId: '' };
    const exception = ApiException.unauthenticated();

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue.',
      },
    });
  });

  it('maps standard HttpException with string payload to known ApiErrorCode', () => {
    const exception = new HttpException('Access denied', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied',
        requestId: 'test-req-123',
      },
    });
  });

  it('maps standard status codes to correct fallback error codes', () => {
    const cases: Array<[number, string]> = [
      [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
      [HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED'],
      [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
      [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
      [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
      [HttpStatus.SERVICE_UNAVAILABLE, 'NOT_READY'],
      [HttpStatus.I_AM_A_TEAPOT, 'INTERNAL_ERROR'],
    ];

    for (const [status, expectedCode] of cases) {
      mockResponse.status.mockClear();
      mockResponse.json.mockClear();

      const exception = new HttpException('Failed', status);
      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(status);
      const payload = (mockResponse.json.mock.calls[0] as [unknown])[0] as {
        ok: boolean;
        error: { code: string };
      };
      expect(payload.ok).toBe(false);
      expect(payload.error.code).toBe(expectedCode);
    }
  });

  it('handles structured HttpException payload with fallback when code or message is non-string', () => {
    const exception = new HttpException(
      { code: 123, message: null, details: ['err'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request failed.',
        details: ['err'],
        requestId: 'test-req-123',
      },
    });
  });

  it('handles non-object non-string payload with default message', () => {
    const exception = new HttpException(
      null as unknown as string,
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request failed.',
        requestId: 'test-req-123',
      },
    });
  });

  it('catches unhandled Error, logs stack trace, and masks error as INTERNAL_ERROR 500', () => {
    const unhandledError = new Error(
      'Database connection failed catastrophically',
    );

    filter.catch(unhandledError, mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled exception',
      unhandledError.stack,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'test-req-123',
      },
    });
  });

  it('catches non-Error throwables and logs stringified exception', () => {
    filter.catch('Unexpected string rejection', mockHost);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled exception',
      'Unexpected string rejection',
    );
    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'test-req-123',
      },
    });
  });
});
